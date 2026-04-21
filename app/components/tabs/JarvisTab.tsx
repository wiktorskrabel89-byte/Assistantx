"use client";

export default function JarvisTab() {
  return (
    <div className="flex flex-col gap-8 p-8 items-center">
      <h1 className="text-3xl font-bold mb-4">Jarvis App Download</h1>
      <div className="flex gap-4 mb-8">
        <a
          href="/jarvis/JarvisSetup.exe"
          download
          className="rounded-xl bg-blue-600 px-6 py-3 text-white font-semibold shadow hover:bg-blue-700 transition"
        >
          Download for Windows
        </a>
        <a
          href="/jarvis/JarvisApp.apk"
          download
          className="rounded-xl bg-green-600 px-6 py-3 text-white font-semibold shadow hover:bg-green-700 transition"
        >
          Download for Android
        </a>
      </div>
    </div>
  );
}
