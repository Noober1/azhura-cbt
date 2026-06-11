/**
 * Azhura CBT Console — Admin Supervisor API client.
 *
 * Typed wrappers over `/admin/supervisors` (#139, #140). `listAll()` returns the
 * full {@link SupervisorAccount} for every supervisor (active + inactive); the
 * assignment picker filters to active client-side. Passwords are write-only —
 * only the plaintext `initialPassword` (last set value) is ever read back, for
 * credential distribution.
 */

import api from "./api";
import type {
  CreateSupervisorRequest,
  SupervisorAccount,
  UpdateSupervisorRequest,
} from "@azhura/shared";

export const supervisorsApi = {
  /** All supervisors, ordered by name. Pass `activeOnly` for the assignment picker. */
  async listAll(activeOnly = false): Promise<SupervisorAccount[]> {
    const { data } = await api.get<SupervisorAccount[]>("/admin/supervisors", {
      params: activeOnly ? { activeOnly: "true" } : undefined,
    });
    return data;
  },

  async create(body: CreateSupervisorRequest): Promise<SupervisorAccount> {
    const { data } = await api.post<SupervisorAccount>("/admin/supervisors", body);
    return data;
  },

  async update(id: string, body: UpdateSupervisorRequest): Promise<SupervisorAccount> {
    const { data } = await api.put<SupervisorAccount>(`/admin/supervisors/${id}`, body);
    return data;
  },

  async updatePassword(id: string, password: string): Promise<SupervisorAccount> {
    const { data } = await api.patch<SupervisorAccount>(
      `/admin/supervisors/${id}/password`,
      { password }
    );
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/admin/supervisors/${id}`);
  },
};
