import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { StudentListResponse, StudentSummary } from "../../types";

// Mock the shared axios instance so we assert the client's URL/method/body
// contract without any real HTTP. The factory must not reference outer
// variables (hoisting), so we grab the mocked fns after importing.
vi.mock("../api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from "../api";
import { studentsApi } from "../students-api";

const mockApi = api as unknown as {
  get: Mock;
  post: Mock;
  patch: Mock;
  delete: Mock;
};

function summary(over: Partial<StudentSummary> = {}): StudentSummary {
  return {
    id: "u-1",
    nis: "12345",
    name: "Ahmad Faisal",
    initialPassword: null,
    groupId: "g-1",
    groupName: "Kelas 7A",
    batch: 2026,
    isActive: true,
    createdAt: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("studentsApi.list", () => {
  it("GETs /admin/students forwarding the query params and returns the response body", async () => {
    const body: StudentListResponse = {
      data: [summary()],
      meta: { total: 1, page: 1, limit: 20 },
    };
    mockApi.get.mockResolvedValue({ data: body });

    const result = await studentsApi.list({ q: "ahmad", groupId: "g-1", page: 2, limit: 20 });

    expect(mockApi.get).toHaveBeenCalledWith("/admin/students", {
      params: { q: "ahmad", groupId: "g-1", page: 2, limit: 20 },
    });
    expect(result).toEqual(body);
  });
});

describe("studentsApi.get", () => {
  it("GETs /admin/students/:id and unwraps the body", async () => {
    const row = summary({ id: "u-9" });
    mockApi.get.mockResolvedValue({ data: row });

    const result = await studentsApi.get("u-9");

    expect(mockApi.get).toHaveBeenCalledWith("/admin/students/u-9");
    expect(result).toEqual(row);
  });
});

describe("studentsApi.create", () => {
  it("POSTs the create payload to /admin/students", async () => {
    const created = summary({ id: "u-new" });
    mockApi.post.mockResolvedValue({ data: created });
    const input = { nis: "55555", name: "Dewi", password: "secret@123", groupId: "g-2" };

    const result = await studentsApi.create(input);

    expect(mockApi.post).toHaveBeenCalledWith("/admin/students", input);
    expect(result).toEqual(created);
  });
});

describe("studentsApi.update", () => {
  it("PATCHes /admin/students/:id with the partial payload", async () => {
    const updated = summary({ name: "Renamed" });
    mockApi.patch.mockResolvedValue({ data: updated });

    const result = await studentsApi.update("u-1", { name: "Renamed" });

    expect(mockApi.patch).toHaveBeenCalledWith("/admin/students/u-1", { name: "Renamed" });
    expect(result).toEqual(updated);
  });
});

describe("studentsApi.remove", () => {
  it("DELETEs /admin/students/:id", async () => {
    mockApi.delete.mockResolvedValue({ data: undefined });

    await studentsApi.remove("u-1");

    expect(mockApi.delete).toHaveBeenCalledWith("/admin/students/u-1");
  });
});

describe("studentsApi.fetchAll", () => {
  it("collects a single page when all rows fit in one response", async () => {
    mockApi.get.mockResolvedValue({
      data: { data: [summary({ id: "u-1" }), summary({ id: "u-2" })], meta: { total: 2, page: 1, limit: 100 } },
    });

    const all = await studentsApi.fetchAll({ groupId: "g-1" });

    expect(all).toHaveLength(2);
    expect(mockApi.get).toHaveBeenCalledTimes(1);
    expect(mockApi.get).toHaveBeenCalledWith("/admin/students", {
      params: { groupId: "g-1", page: 1, limit: 100 },
    });
  });

  it("paginates until the accumulated count reaches meta.total", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => summary({ id: `p1-${i}` }));
    const page2 = Array.from({ length: 20 }, (_, i) => summary({ id: `p2-${i}` }));
    mockApi.get
      .mockResolvedValueOnce({ data: { data: page1, meta: { total: 120, page: 1, limit: 100 } } })
      .mockResolvedValueOnce({ data: { data: page2, meta: { total: 120, page: 2, limit: 100 } } });

    const all = await studentsApi.fetchAll({});

    expect(all).toHaveLength(120);
    expect(mockApi.get).toHaveBeenCalledTimes(2);
    expect(mockApi.get).toHaveBeenNthCalledWith(2, "/admin/students", {
      params: { page: 2, limit: 100 },
    });
  });

  it("stops when a page returns zero rows even if meta.total is larger (guards against an infinite loop)", async () => {
    mockApi.get.mockResolvedValue({
      data: { data: [], meta: { total: 999, page: 1, limit: 100 } },
    });

    const all = await studentsApi.fetchAll({});

    expect(all).toHaveLength(0);
    expect(mockApi.get).toHaveBeenCalledTimes(1);
  });
});
