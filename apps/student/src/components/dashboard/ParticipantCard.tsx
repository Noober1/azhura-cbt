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
    <Card data-tour="participant-card">
      <CardHeader className="items-center text-center pb-2">
        <div className="flex justify-center mb-3">
          <div className="size-20 rounded-full bg-indigo text-white flex items-center justify-center text-2xl font-extrabold border-[2.5px] border-[var(--nb-ink)] shadow-[3px_3px_0_var(--nb-ink)]">
            {getInitials(user?.name)}
          </div>
        </div>
        <h2 className="font-bold text-lg text-foreground leading-tight">
          {user?.name ?? "Peserta"}
        </h2>
        <p className="text-xs font-semibold text-muted-foreground">Peserta Ujian Terdaftar</p>
      </CardHeader>

      <CardContent className="space-y-2.5 pt-2 text-sm">
        <InfoRow
          icon={<IdCard className="w-4 h-4 text-muted-foreground" />}
          label="NIS"
          value={user?.nis ?? "-"}
        />
        <InfoRow
          icon={<UserIcon className="w-4 h-4 text-muted-foreground" />}
          label="Nama Lengkap"
          value={user?.name ?? "-"}
        />
        <InfoRow
          icon={<GroupIcon className="w-4 h-4 text-muted-foreground" />}
          label="Kelas / Group"
          value={user?.groupName ?? "-"}
        />
        {user && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-[var(--nb-ink)] bg-emerald/15 px-3 py-2.5 text-emerald dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span className="text-xs font-semibold leading-tight">
              Identitas terverifikasi. Pastikan ini benar Anda sebelum memulai ujian.
            </span>
          </div>
        )}
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
  <div className="flex items-center justify-between gap-3 rounded-lg border border-soft bg-muted/50 px-3 py-2 dark:border-soft">
    <span className="flex items-center gap-2 font-medium text-muted-foreground">
      {icon}
      {label}
    </span>
    <span className="font-semibold text-foreground truncate text-right">
      {value}
    </span>
  </div>
);
