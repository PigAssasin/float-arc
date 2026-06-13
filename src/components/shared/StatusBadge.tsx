type Status = "funded" | "due_soon" | "defaulted" | "paid" | "pending";

const STATUS_CONFIG: Record<Status, { label: string; color: string }> = {
  funded:    { label: "Funded",    color: "text-[#DEDBC8]" },
  due_soon:  { label: "Due Soon",  color: "text-[#FFA500]" },
  defaulted: { label: "Defaulted", color: "text-[#FF0000]" },
  paid:      { label: "Paid",      color: "text-[#008000]" },
  pending:   { label: "Pending",   color: "text-gray-400"  },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, color } = STATUS_CONFIG[status];
  return (
    <span className={`bg-[#212121] ${color} rounded-full px-3 py-1 text-xs font-medium`}>
      {label}
    </span>
  );
}
