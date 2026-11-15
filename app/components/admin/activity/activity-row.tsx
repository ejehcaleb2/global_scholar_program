"use client";

import type { AdminAuditLog } from "@/lib/api/index";
import { useCopy } from "@/lib/copy/provider";
import { Avatar } from "@/components/ui/avatar";
import { LocalTime } from "@/components/ui/local-time";

function auditVerb(action: string, t: ReturnType<typeof useCopy>["t"]) {
  const key: Record<string, string> = {
    create: "created", created: "created", update: "updated", updated: "updated",
    delete: "deleted", deleted: "deleted", publish: "published", published: "published",
    unpublish: "unpublished", unpublished: "unpublished", upload: "uploaded", uploaded: "uploaded",
    pin: "pinned", pinned: "pinned", reorder: "reordered", reordered: "reordered",
  };
  const translation = key[action];
  return translation ? t.admin[translation as keyof typeof t.admin] as string : action;
}

export function AuditActivityRow({ entry }: { entry: AdminAuditLog }) {
  const { t } = useCopy();
  const actor = entry.actor.full_name || entry.actor.email;
  const record = entry.label || `${entry.entity_type} ${entry.entity_id.slice(0, 8)}`;
  return <tr className="transition-colors duration-200 ease-out hover:bg-surface-alt">
    <td className="px-4 py-4 text-base text-text"><div className="flex items-center gap-3"><Avatar userId={entry.actor.id} name={entry.actor.full_name} email={entry.actor.email} avatarKey={entry.actor.avatar_url} updatedAt={entry.actor.updated_at} /><span><span className="block font-semibold">{actor}</span><span className="block text-sm">{entry.actor.email}</span></span></div></td>
    <td className="px-4 py-4 text-base text-text">{auditVerb(entry.action, t)}</td>
    <td className="px-4 py-4 text-base text-text">{record}</td>
    <td className="whitespace-nowrap px-4 py-4 text-sm text-text"><LocalTime value={entry.created_at} relative /></td>
  </tr>;
}