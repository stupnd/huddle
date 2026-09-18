import type { Member } from "@/lib/domain/types";
import { avatarRing, avatarText } from "@/lib/design/tokens";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { avatarSize, type AvatarSize } from "@/components/agents/AgentAvatar";

/**
 * Member avatar: a monogram on a surface disc with a ring in the member's hue.
 * Photos, when present, take the same ring. Agents use AgentAvatar (solid disc, mark)
 * so people and agents read differently everywhere.
 */
type Props = { member: Pick<Member, "id" | "name" | "hue" | "photoUrl">; size?: AvatarSize; className?: string };

const monogramText: Record<AvatarSize, string> = {
  xs: "text-[0.5rem]",
  sm: "text-micro",
  md: "text-body-sm",
  lg: "text-body",
  xl: "text-display-sm",
};

export function MemberAvatar({ member, size = "md", className }: Props) {
  return (
    <span
      role="img"
      aria-label={member.name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-surface-3 ring-2 ring-inset",
        "font-display font-bold tracking-tight",
        avatarRing[member.hue],
        avatarText[member.hue],
        avatarSize[size],
        monogramText[size],
        className,
      )}
    >
      {member.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.photoUrl} alt="" className="size-full object-cover" />
      ) : (
        initials(member.name)
      )}
    </span>
  );
}

/** overlapping stack of member avatars, capped with a "+n" disc */
export function AvatarStack({ members, size = "sm", max = 5, className }: { members: Member[]; size?: AvatarSize; max?: number; className?: string }) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <span className={cn("inline-flex items-center", className)} aria-label={`${members.length} in the group: ${members.map((m) => m.name).join(", ")}`}>
      {shown.map((m, i) => (
        <MemberAvatar key={m.id} member={m} size={size} className={cn("outline-2 outline-canvas", i > 0 && "-ml-1")} />
      ))}
      {rest > 0 && (
        <span className={cn("-ml-1 inline-flex items-center justify-center rounded-full bg-surface-2 text-micro text-ink-2 outline-2 outline-canvas figures", avatarSize[size])}>
          +{rest}
        </span>
      )}
    </span>
  );
}
