export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const res = await fetch("http://127.0.0.1:8000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      throw new Error(`Backend error: ${res.status}`);
    }

    const data = await res.json();
    return Response.json({ reply: data.reply });
  } catch (error) {
    console.error("AI backend error:", error);
    return Response.json({ reply: "AI backend not available. Is FastAPI running on port 8000?" });
  }
}
