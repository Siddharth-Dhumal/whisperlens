"use client";

import { useState } from "react";
import LiveSessionPanel from "@/components/LiveSessionPanel";
import StudyVault from "@/components/StudyVault";
import StudySources from "@/components/StudySources";
import SessionDetailPanel from "@/components/SessionDetailPanel";
import SourceDetailPanel from "@/components/SourceDetailPanel";

type MainView =
  | { kind: "live" }
  | { kind: "session"; sessionId: string }
  | { kind: "source"; sourceId: string }
  | { kind: "new-source" };

export default function Home() {
  const [sessionListRefreshKey, setSessionListRefreshKey] = useState(0);
  const [sourceListRefreshKey, setSourceListRefreshKey] = useState(0);
  const [livePanelKey, setLivePanelKey] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mainView, setMainView] = useState<MainView>({ kind: "live" });

  function handleTurnSaved() {
    setSessionListRefreshKey((n) => n + 1);
  }

  function handleNewChat() {
    setMainView({ kind: "live" });
    setLivePanelKey((n) => n + 1);
  }

  function handleSelectSession(sessionId: string) {
    setMainView({ kind: "session", sessionId });
  }

  function handleSelectSource(sourceId: string) {
    setMainView({ kind: "source", sourceId });
  }

  function handleNewSource() {
    setMainView({ kind: "new-source" });
  }

  function handleSourceCreated() {
    setMainView({ kind: "live" });
    setSourceListRefreshKey((n) => n + 1);
  }

  const activeSessionId =
    mainView.kind === "session" ? mainView.sessionId : null;

  const activeSourceId =
    mainView.kind === "source" ? mainView.sourceId : null;

  return (
    <main className="wl-app-root">
      <div
        className={`wl-app-layout ${isSidebarCollapsed ? "wl-app-layout-collapsed" : ""}`}
      >
        <aside className="wl-app-sidebar">
          <div className="wl-app-sidebar-header">
            {!isSidebarCollapsed && (
              <div className="wl-app-sidebar-brand">WhisperLens</div>
            )}

            <button
              type="button"
              className="wl-app-sidebar-toggle"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isSidebarCollapsed ? "☰" : "✕"}
            </button>
          </div>

          {!isSidebarCollapsed && (
            <div className="wl-app-sidebar-content">
              <StudyVault
                refreshKey={sessionListRefreshKey}
                activeSessionId={activeSessionId}
                onSelect={handleSelectSession}
                onNewChat={handleNewChat}
              />

              <div className="wl-sidebar-divider" />

              <StudySources
                refreshKey={sourceListRefreshKey}
                activeSourceId={activeSourceId}
                onSelect={handleSelectSource}
                onNewSource={handleNewSource}
              />
            </div>
          )}
        </aside>

        {isSidebarCollapsed && (
          <button
            type="button"
            className="wl-hamburger-toggle"
            onClick={() => setIsSidebarCollapsed(false)}
            aria-label="Open sidebar"
          >
            ☰
          </button>
        )}

        <section className="wl-app-main">
          {mainView.kind === "live" && (
            <LiveSessionPanel
              key={livePanelKey}
              onTurnSaved={handleTurnSaved}
            />
          )}

          {mainView.kind === "session" && (
            <SessionDetailPanel
              sessionId={mainView.sessionId}
              onTurnSaved={handleTurnSaved}
            />
          )}

          {mainView.kind === "source" && (
            <SourceDetailPanel sourceId={mainView.sourceId} />
          )}

          {mainView.kind === "new-source" && (
            <SourceDetailPanel
              sourceId={null}
              onSourceCreated={handleSourceCreated}
            />
          )}
        </section>
      </div>
    </main>
  );
}