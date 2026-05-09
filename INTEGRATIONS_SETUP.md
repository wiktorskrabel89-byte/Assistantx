# Konfiguracja środowiska dla integracji

1. Skopiuj plik `.env.example` do `.env`:
   
   cp .env.example .env

2. Uzupełnij wartości:
   - `NEXT_PUBLIC_SUPABASE_URL` — znajdziesz w panelu Supabase → Project Settings → API
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — jw.
   - `GROQ_API_KEY` — klucz Groq (główny provider czatu)
   - `GOOGLE_AI_STUDIO_API_KEY` — klucz Google AI Studio (fallback Gemini)
   - `OPENROUTER_API_KEY` — swój klucz OpenRouter

3. Zrestartuj serwer dev:
   
   npm run dev:next

Po tych krokach integracje (Google, GitHub itd.) będą działać poprawnie.
