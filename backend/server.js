const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const nodemailer = require('nodemailer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// ──── CONFIG ────
const GEMINI_API_KEY = 'AIzaSyBt-YmbCxzOWOmIWk0tggfC9obP2XfVHoQ';
const SERIAL_PORT = process.env.SERIAL_PORT || 'COM3'; // Change to your Arduino port e.g. /dev/ttyUSB0 on Linux
const BAUD_RATE = 9600;

// Email config — fill in your Gmail credentials
const EMAIL_CONFIG = {
  from: 'your_email@gmail.com',          // <-- Your Gmail
  to: 'recipient@gmail.com',             // <-- Alert recipient
  password: 'your_app_password'          // <-- Gmail App Password (not regular password)
};

// ──── GEMINI AI ────
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// ──── DATA STORE ────
let readings = [];
let lastEmailTime = {};
const EMAIL_COOLDOWN = 60 * 1000; // 1 minute

// ──── SERIAL PORT ────
let port;
try {
  port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  parser.on('data', (line) => {
    try {
      const data = JSON.parse(line.trim());
      if (data.percentage !== undefined) {
        const reading = {
          ...data,
          timestamp: new Date().toISOString()
        };
        readings.push(reading);
        if (readings.length > 500) readings.shift();

        io.emit('sensorData', reading);
        checkAndSendAlert(reading);
        console.log('📡 Data:', reading);
      }
    } catch (e) {
      // Non-JSON line, ignore
    }
  });

  port.on('open', () => {
    console.log(`✅ Serial port ${SERIAL_PORT} opened`);
    io.emit('connectionStatus', { connected: true });
  });

  port.on('error', (err) => {
    console.error('❌ Serial error:', err.message);
    io.emit('connectionStatus', { connected: false });
  });
} catch (err) {
  console.error('❌ Could not open serial port:', err.message);
  console.log('🔧 Running in demo mode without Arduino');
}

// ──── EMAIL ALERTS ────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_CONFIG.from,
    pass: EMAIL_CONFIG.password
  }
});

function checkAndSendAlert(data) {
  const alertTypes = [];
  if (data.status === 'OVERFLOW') alertTypes.push('OVERFLOW');
  if (data.status === 'FULL') alertTypes.push('FULL');
  if (data.status === 'LOW') alertTypes.push('LOW');

  alertTypes.forEach(type => {
    const now = Date.now();
    if (!lastEmailTime[type] || now - lastEmailTime[type] > EMAIL_COOLDOWN) {
      lastEmailTime[type] = now;
      sendEmail(type, data);
    }
  });
}

async function sendEmail(alertType, data) {
  const subjects = {
    OVERFLOW: '🚨 OVERFLOW ALERT - Water Tank',
    FULL: '✅ Tank Full - Water Level Monitor',
    LOW: '⚠️ LOW WATER - Refill Needed'
  };

  const mailOptions = {
    from: EMAIL_CONFIG.from,
    to: EMAIL_CONFIG.to,
    subject: subjects[alertType] || 'Water Level Alert',
    html: `
      <h2>💧 Smart Water Level Monitor Alert</h2>
      <p><strong>Alert Type:</strong> ${alertType}</p>
      <p><strong>Water Level:</strong> ${data.percentage}%</p>
      <p><strong>Distance:</strong> ${data.distance} cm</p>
      <p><strong>Status:</strong> ${data.status}</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent: ${alertType}`);
    io.emit('emailSent', { type: alertType, time: new Date().toISOString() });
  } catch (err) {
    console.error('📧 Email error:', err.message);
  }
}

// ──── GEMINI AI ENDPOINTS ────
app.get('/api/readings', (req, res) => {
  res.json(readings);
});

app.post('/api/ai/predict', async (req, res) => {
  try {
    if (readings.length < 5) {
      return res.json({ error: 'Need at least 5 readings for prediction', readings: readings.length });
    }

    const recent = readings.slice(-20);
    const summary = recent.map(r =>
      `Time: ${r.timestamp}, Level: ${r.percentage}%, Status: ${r.status}`
    ).join('\n');

    const prompt = `You are an IoT water level monitoring AI assistant.
    
Here are the recent water level readings from an HC-SR04 ultrasonic sensor on a water tank:

${summary}

Based on these readings, please provide:
1. **Usage Pattern**: Describe the current water usage pattern
2. **Prediction**: Will the tank need refilling in the next 1-2 hours? 
3. **Estimated Empty Time**: When will the tank reach LOW level (below 30%)?
4. **Recommendation**: What action should the user take?

Keep the response concise and practical. Format with clear sections.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    res.json({ prediction: text, readingsUsed: recent.length });
  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/analytics', async (req, res) => {
  try {
    if (readings.length < 10) {
      return res.json({ error: 'Need at least 10 readings for analytics', readings: readings.length });
    }

    const all = readings.slice(-50);
    const avgLevel = (all.reduce((sum, r) => sum + r.percentage, 0) / all.length).toFixed(1);
    const maxLevel = Math.max(...all.map(r => r.percentage)).toFixed(1);
    const minLevel = Math.min(...all.map(r => r.percentage)).toFixed(1);
    const overflowCount = all.filter(r => r.status === 'OVERFLOW').length;
    const lowCount = all.filter(r => r.status === 'LOW').length;

    const prompt = `You are analyzing water consumption data from a smart IoT water tank monitor.

Statistics from ${all.length} readings:
- Average Level: ${avgLevel}%
- Maximum Level: ${maxLevel}%
- Minimum Level: ${minLevel}%
- Overflow Events: ${overflowCount}
- Low Water Events: ${lowCount}
- Time Range: ${all[0].timestamp} to ${all[all.length-1].timestamp}

Please provide:
1. **Consumption Analysis**: Analyze the water usage efficiency
2. **Waste Detection**: Are there signs of overflow/waste?
3. **Conservation Tips**: 2-3 specific tips based on this data
4. **Efficiency Score**: Give a score out of 10 with explanation

Be specific and actionable.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    res.json({
      analytics: text,
      stats: { avgLevel, maxLevel, minLevel, overflowCount, lowCount, totalReadings: all.length }
    });
  } catch (err) {
    console.error('Gemini analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/email/test', async (req, res) => {
  try {
    await sendEmail('TEST', { percentage: 50, distance: 5, status: 'MEDIUM' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──── SOCKET.IO ────
io.on('connection', (socket) => {
  console.log('🔌 Client connected');
  socket.emit('history', readings.slice(-50));
  socket.on('disconnect', () => console.log('🔌 Client disconnected'));
});

// ──── START SERVER ────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Serial port: ${SERIAL_PORT}`);
  console.log(`🤖 Gemini AI: Ready`);
});