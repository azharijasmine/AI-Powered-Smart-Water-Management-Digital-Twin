"""
Run this FIRST to find which Gemini model works with your API key.
Usage:  python test_gemini.py
"""
import google.generativeai as genai

API_KEY = "AIzaSyBt-YmbCxzOWOmIWk0tggfC9obP2XfVHoQ"   # ← your key here
genai.configure(api_key=API_KEY)

print("=" * 55)
print("  GEMINI API DIAGNOSTIC TOOL")
print("=" * 55)

print("\n[STEP 1] Listing models available for your API key...\n")
available = []
try:
    for m in genai.list_models():
        if "generateContent" in m.supported_generation_methods:
            available.append(m.name)
            print(f"  ✅  {m.name}")
except Exception as e:
    print(f"  ❌  Could not list models: {e}")
    print("\n  LIKELY CAUSES:")
    print("    - Invalid API key")
    print("    - No internet connection")
    print("    - API not enabled in Google Cloud")
    print("\n  FIX: https://aistudio.google.com/app/apikey  → Create new key")
    exit(1)

if not available:
    print("  ❌  No models available. Check API key permissions.")
    exit(1)

print(f"\n[STEP 2] Testing {len(available)} models with a sample request...\n")
working = None
for name in available:
    try:
        m = genai.GenerativeModel(name)
        r = m.generate_content("Reply with only: WORKING")
        print(f"  ✅  WORKING: {name}")
        working = name
        break
    except Exception as e:
        print(f"  ❌  {name}: {str(e)[:90]}")

print("\n" + "=" * 55)
if working:
    print(f"  ✅  SUCCESS — Use this model in main.py:")
    print(f'\n      GEMINI_MODEL = "{working}"')
else:
    print("  ❌  NO WORKING MODEL. Steps to fix:")
    print("  1. Go to https://aistudio.google.com/app/apikey")
    print("  2. Create a NEW key (free tier works)")
    print("  3. Replace GEMINI_API_KEY in main.py")
    print("  4. Run this script again")
print("=" * 55)