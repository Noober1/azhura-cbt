/**
 * Azhura CBT Backend — Public Info Route
 *
 * `GET /api/info` returns the school name/address and app version shown by the
 * student client's connection wizard (no auth required). School name/address come
 * from the `settings` table — the single source of truth set during first-run
 * setup and editable on the admin Settings page — while the app version comes
 * from env.
 */

import { Elysia } from "elysia";
import type { SchoolInfo, SystemSettings } from "@azhura/shared";
import { getAppVersion } from "../lib/env";
import { readSettings } from "../lib/settings-service";

/** Maps stored settings + app version onto the public `SchoolInfo` shape. */
export function buildSchoolInfo(
  settings: Pick<SystemSettings, "schoolName" | "schoolAddress">,
  appVersion: string
): SchoolInfo {
  return {
    schoolName: settings.schoolName,
    address: settings.schoolAddress,
    appVersion,
  };
}

export const infoRoutes = new Elysia({ prefix: "/info" }).get("/", async () => {
  const settings = await readSettings();
  return buildSchoolInfo(settings, getAppVersion());
});
