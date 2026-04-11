export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    const res = await fetch("http://127.0.0.1:8000/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
      throw new Error(`Backend error: ${res.status}`);
    }

    const data = await res.json();
    return Response.json({ url: data.url, model: data.model });
  } catch (error) {
    console.error("Image generation error:", error);
    return Response.json({ url: null, model: null, error: "Image generation failed. Is FastAPI running on port 8000?" });
  }
}
