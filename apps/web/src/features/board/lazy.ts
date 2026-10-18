"use client";

import { lazy } from "react";

/**
 * Heavy, rarely used board UI is split into separate chunks and loaded on
 * first use. Each loader is also exposed as a preload, which is called on
 * hover or focus so the chunk is usually ready before the click lands.
 */

const loadTaskDetails = () => import("./components/task-details/task-details-dialog");
const loadGitHubSync = () => import("./components/github-sync/github-sync-drawer");
const loadAnalytics = () => import("./components/analytics/board-analytics-dialog");
const loadMembers = () => import("./components/members/members-dialog");

export const LazyTaskDetailsDialog = lazy(() =>
  loadTaskDetails().then((m) => ({ default: m.TaskDetailsDialog })),
);
export const LazyGitHubSyncDrawer = lazy(() =>
  loadGitHubSync().then((m) => ({ default: m.GitHubSyncDrawer })),
);
export const LazyBoardAnalyticsDialog = lazy(() =>
  loadAnalytics().then((m) => ({ default: m.BoardAnalyticsDialog })),
);

export const LazyMembersDialog = lazy(() =>
  loadMembers().then((m) => ({ default: m.MembersDialog })),
);

export const preloadTaskDetails = () => void loadTaskDetails();
export const preloadGitHubSync = () => void loadGitHubSync();
export const preloadAnalytics = () => void loadAnalytics();
export const preloadMembers = () => void loadMembers();
