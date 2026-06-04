import { User as UserIcon, IdCard, Users as GroupIcon, ShieldCheck } from "lucide-react";
import type { User } from "../../types";
import { Card, CardContent, CardHeader } from "../ui/card";

interface ParticipantCardProps {
  user: User | null;
}

/** Derives up-to-two uppercase initials from a full name for the avatar. */
const getInitials = (name?: string): string => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((p) => p[0]).join("");
  return initials.toUpperCase();
};

/** Left-column card summarizing the signed-in participant's identity. */
export const ParticipantCard = ({ user }: ParticipantCardProps) => {
  return (
    <Card className="shadow-sm border border-neutral-200/60 bg-white/90 backdrop-blur-sm dark:bg-neutral-900/90 dark:border-neutral-800/60">
      <CardHeader className="items-center text-center pb-2">
        <div className="flex justify-center mb-3">
          <div className="size-20 rounded-full bg-linear-to-br from-emerald-500 to-indigo-600 text-white flex items-center justify-center text-2xl font-extrabold shadow-lg shadow-emerald-600/20">
            {getInitials(user?.name)}
          </div>
        </div>
        <h2 className="font-bold text-lg text-neutral-950 dark:text-neutral-50 leading-tight">
          {user?.name ?? "Peserta"}
        </h2>
        <p className="text-xs font-semibold text-neutral-500">Peserta Ujian Terdaftar</p>
      </CardHeader>

      <CardContent className="space-y-2.5 pt-2 text-sm">
        <InfoRow
          icon={<IdCard className="w-4 h-4 text-neutral-400" />}
          label="NIS"
          value={user?.nis ?? "-"}
        />
        <InfoRow
          icon={<UserIcon className="w-4 h-4 text-neutral-400" />}
          label="Nama Lengkap"
          value={user?.name ?? "-"}
        />
        <InfoRow
          icon={<GroupIcon className="w-4 h-4 text-neutral-400" />}
          label="Kelas / Group"
          value={user?.groupName ?? "-"}
        />
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200/60 bg-emerald-50/60 px-3 py-2.5 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span className="text-xs font-semibold leading-tight">
            Identitas terverifikasi. Pastikan ini benar Anda sebelum memulai ujian.
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const InfoRow = ({ icon, label, value }: InfoRowProps) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-100 bg-neutral-50/50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-800/20">
    <span className="flex items-center gap-2 font-medium text-neutral-500">
      {icon}
      {label}
    </span>
    <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-right">
      {value}
    </span>
  </div>
);
