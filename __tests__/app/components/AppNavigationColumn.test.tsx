import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  AppNavigationColumn,
  type AppNavigationTab,
} from "@/app/components/AppNavigationColumn";
import type { ChatThread } from "@/app/lib/chat-types";

// ── Workspace context mock ────────────────────────────────────────────────────

const mockSetActiveChatId = jest.fn();
const mockCreateChatAction = jest.fn();

const MOCK_CHATS: ChatThread[] = [
  { id: "chat-1", title: "First Chat",  messages: [], createdAt: 1, updatedAt: 1 },
  { id: "chat-2", title: "Second Chat", messages: [], createdAt: 2, updatedAt: 2 },
  { id: "chat-3", title: "Third Chat",  messages: [], createdAt: 3, updatedAt: 3 },
];

jest.mock("@/app/providers/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    activeChat: MOCK_CHATS[0],
    activeWorkspace: { id: "ws-1", name: "Test Workspace", chats: MOCK_CHATS },
    setActiveChatId: mockSetActiveChatId,
    createChatAction: mockCreateChatAction,
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_PROPS = {
  dark: false,
  activeTab: "chat" as AppNavigationTab,
  onSelectTab: jest.fn(),
  appMode: "ai-chat" as const,
  onSetAppMode: jest.fn(),
  pinnedAddOns: [] as string[],
  onSetPinnedAddOns: jest.fn(),
  userEmail: "user@example.com",
  isAdmin: false,
};

function renderNav(overrides: Partial<typeof DEFAULT_PROPS> = {}) {
  const onSelectTab = overrides.onSelectTab ?? jest.fn();
  const utils = render(
    <AppNavigationColumn {...DEFAULT_PROPS} {...overrides} onSelectTab={onSelectTab} />
  );
  return { ...utils, onSelectTab };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AppNavigationColumn — click interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("tab navigation", () => {
    it("calls onSelectTab('chat') when the Chat tab is clicked", () => {
      const { onSelectTab } = renderNav({ activeTab: "settings" });
      fireEvent.click(screen.getAllByTitle("Chat")[0] ?? screen.getByRole("button", { name: /^Chat$/i }));
      expect(onSelectTab).toHaveBeenCalledWith("chat");
    });

    it("calls onSelectTab('settings') when the Settings icon is clicked", () => {
      const { onSelectTab } = renderNav();
      fireEvent.click(screen.getByTitle("Settings"));
      expect(onSelectTab).toHaveBeenCalledWith("settings");
    });

    it("calls onSelectTab('notifications') when the Notifications icon is clicked", () => {
      const { onSelectTab } = renderNav();
      fireEvent.click(screen.getByTitle("Notifications"));
      expect(onSelectTab).toHaveBeenCalledWith("notifications");
    });
  });

  describe("apps drawer", () => {
    it("opens the apps dropdown when the Apps button is clicked", () => {
      renderNav();
      // apps drawer not visible yet
      expect(screen.queryByPlaceholderText("Search applications...")).not.toBeInTheDocument();
      fireEvent.click(screen.getAllByTitle("Applications")[0] ?? screen.getByRole("button", { name: /Applications/i }));
      expect(screen.getAllByPlaceholderText("Search applications...").length).toBeGreaterThan(0);
    });
  });

  describe("chat list", () => {
    it("renders all chat items from the workspace", () => {
      renderNav();
      expect(screen.getAllByText("First Chat").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Second Chat").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Third Chat").length).toBeGreaterThan(0);
    });

    it("calls setActiveChatId and onSelectTab('chat') when a chat item is clicked", () => {
      const { onSelectTab } = renderNav({ activeTab: "settings" });
      fireEvent.click(screen.getAllByText("Second Chat")[0]);
      expect(mockSetActiveChatId).toHaveBeenCalledWith("ws-1", "chat-2");
      expect(onSelectTab).toHaveBeenCalledWith("chat");
    });

    it("calls createChatAction when the New chat (+) button is clicked", () => {
      renderNav();
      fireEvent.click(screen.getByRole("button", { name: "New chat" }));
      expect(mockCreateChatAction).toHaveBeenCalledTimes(1);
    });

    it("filters chat items when the search input has text", () => {
      renderNav();
      const searchInput = screen.getByPlaceholderText("Search chats…");
      fireEvent.change(searchInput, { target: { value: "Second" } });
      expect(screen.queryByText("First Chat")).not.toBeInTheDocument();
      expect(screen.getByText("Second Chat")).toBeInTheDocument();
      expect(screen.queryByText("Third Chat")).not.toBeInTheDocument();
    });

    it("shows all chats again after clearing the search", () => {
      renderNav();
      const searchInput = screen.getByPlaceholderText("Search chats…");
      fireEvent.change(searchInput, { target: { value: "Second" } });
      fireEvent.change(searchInput, { target: { value: "" } });
      expect(screen.getAllByText("First Chat").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Third Chat").length).toBeGreaterThan(0);
    });

    it("shows 'No chats found.' when search matches nothing", () => {
      renderNav();
      const searchInput = screen.getByPlaceholderText("Search chats…");
      fireEvent.change(searchInput, { target: { value: "zzznomatch" } });
      expect(screen.getByText("No chats found.")).toBeInTheDocument();
    });

    it("clears the search when the X clear button is clicked", () => {
      renderNav();
      const searchInput = screen.getByPlaceholderText("Search chats…");
      fireEvent.change(searchInput, { target: { value: "Second" } });
      // After typing, only "Second Chat" is visible — clicking the X button restores all
      const clearButton = screen.getByRole("button", { name: "Clear search" });
      fireEvent.click(clearButton);
      expect(screen.getAllByText("First Chat").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Second Chat").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Third Chat").length).toBeGreaterThan(0);
    });
  });
});
