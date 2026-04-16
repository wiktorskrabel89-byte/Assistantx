import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VoiceModal } from "@/app/components/VoiceModal";

// ── Mock browser APIs that are not available in jsdom ─────────────────────────
class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.(new CloseEvent("close"));
  }

  static instances: MockWebSocket[] = [];
  static reset() {
    MockWebSocket.instances = [];
  }
}

global.WebSocket = MockWebSocket as unknown as typeof WebSocket;

const mockGetUserMedia = jest.fn(() =>
  Promise.resolve({
    getTracks: () => [{ stop: jest.fn() }],
  } as unknown as MediaStream)
);

Object.defineProperty(global.navigator, "mediaDevices", {
  value: { getUserMedia: mockGetUserMedia },
  configurable: true,
});

class MockAudioContext {
  sampleRate = 24000;
  destination = {};
  createMediaStreamSource = jest.fn(() => ({ connect: jest.fn() }));
  createScriptProcessor = jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    onaudioprocess: null as ((e: AudioProcessingEvent) => void) | null,
  }));
  createBuffer = jest.fn(() => ({ copyToChannel: jest.fn() }));
  createBufferSource = jest.fn(() => ({
    buffer: null,
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    onended: null as (() => void) | null,
  }));
  close = jest.fn();
}

global.AudioContext = MockAudioContext as unknown as typeof AudioContext;

// ── Helpers ──────────────────────────────────────────────────────────────────
function renderModal(props: Partial<{ onClose: () => void; dark: boolean }> = {}) {
  const onClose = props.onClose ?? jest.fn();
  const dark = props.dark ?? false;
  const utils = render(<VoiceModal onClose={onClose} dark={dark} />);
  return { ...utils, onClose };
}

describe("VoiceModal", () => {
  beforeEach(() => {
    MockWebSocket.reset();
    jest.clearAllMocks();
  });

  it("renders the Voice Mode heading", () => {
    renderModal();
    expect(screen.getByText(/Voice Mode/i)).toBeInTheDocument();
  });

  it("shows connecting status initially", () => {
    renderModal();
    expect(screen.getByText(/Connecting/i)).toBeInTheDocument();
  });

  it("shows placeholder text when transcript is empty", () => {
    renderModal();
    expect(
      screen.getByText(/Conversation will appear here/i)
    ).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("creates a WebSocket on mount", () => {
    renderModal();
    expect(MockWebSocket.instances.length).toBeGreaterThan(0);
  });

  it("shows ready status after session.updated message", async () => {
    renderModal();
    const ws = MockWebSocket.instances[0];

    await act(async () => {
      // First send session.created so component sets up session
      ws.onmessage?.({ data: JSON.stringify({ type: "session.created" }) } as MessageEvent);
      // Then session.updated triggers setStatus("ready")
      ws.onmessage?.({ data: JSON.stringify({ type: "session.updated" }) } as MessageEvent);
    });

    expect(screen.getByText(/Listening/i)).toBeInTheDocument();
  });

  it("shows user_speaking status on input_audio_buffer.speech_started", async () => {
    renderModal();
    const ws = MockWebSocket.instances[0];

    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({ type: "input_audio_buffer.speech_started" }),
      } as MessageEvent);
    });

    expect(screen.getByText(/You're speaking/i)).toBeInTheDocument();
  });

  it("shows agent_speaking status on response.output_audio.delta", async () => {
    renderModal();
    const ws = MockWebSocket.instances[0];

    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "response.output_audio.delta",
          delta: btoa("fake pcm"),
        }),
      } as MessageEvent);
    });

    expect(screen.getByText(/Agent speaking/i)).toBeInTheDocument();
  });

  it("shows error status on WebSocket error", async () => {
    renderModal();
    const ws = MockWebSocket.instances[0];

    await act(async () => {
      ws.onerror?.(new Event("error"));
    });

    expect(screen.getByText(/WebSocket connection failed/i)).toBeInTheDocument();
  });

  it("shows error status on error message from server", async () => {
    renderModal();
    const ws = MockWebSocket.instances[0];

    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "error",
          error: { message: "Something went wrong" },
        }),
      } as MessageEvent);
    });

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it("displays transcript entries when user speaks", async () => {
    renderModal();
    const ws = MockWebSocket.instances[0];

    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({ type: "input_audio_buffer.speech_started" }),
      } as MessageEvent);
    });

    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "Hello AI",
        }),
      } as MessageEvent);
    });

    expect(screen.getByText("Hello AI")).toBeInTheDocument();
  });

  it("closes the WebSocket when unmounted", async () => {
    const { unmount } = renderModal();
    const ws = MockWebSocket.instances[0];
    unmount();
    expect(ws.readyState).toBe(3); // CLOSED
  });

  it("applies dark background class when dark prop is true", () => {
    renderModal({ dark: true });
    const modal = document.querySelector(".bg-gray-900");
    expect(modal).not.toBeNull();
  });

  it("applies light background class when dark prop is false", () => {
    renderModal({ dark: false });
    const modal = document.querySelector(".bg-white");
    expect(modal).not.toBeNull();
  });
});
