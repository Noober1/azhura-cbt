/**
 * Azhura CBT Console — Admin Groups API client.
 *
 * Typed wrappers over `/admin/groups`. Deleting a group unassigns its members
 * (the backend reports how many via `unassignedMembers`).
 */

import api from "./api";
import type {
  GroupCreateInput,
  GroupListResponse,
  GroupSummary,
  GroupUpdateInput,
} from "../types";

export interface ListGroupsParams {
  q?: string;
  page?: number;
  limit?: number;
}

export const groupsApi = {
  async list(params: ListGroupsParams): Promise<GroupListResponse> {
    const { data } = await api.get<GroupListResponse>("/admin/groups", { params });
    return data;
  },

  async create(input: GroupCreateInput): Promise<GroupSummary> {
    const { data } = await api.post<GroupSummary>("/admin/groups", input);
    return data;
  },

  async update(groupId: string, input: GroupUpdateInput): Promise<GroupSummary> {
    const { data } = await api.patch<GroupSummary>(`/admin/groups/${groupId}`, input);
    return data;
  },

  async remove(groupId: string): Promise<{ success: boolean; unassignedMembers: number }> {
    const { data } = await api.delete(`/admin/groups/${groupId}`);
    return data;
  },
};
