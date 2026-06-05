import { Elysia } from "elysia";
import { getSchoolInfoConfig } from "../lib/env";

export const infoRoutes = new Elysia({ prefix: "/info" }).get("/", () => {
  return getSchoolInfoConfig();
});
