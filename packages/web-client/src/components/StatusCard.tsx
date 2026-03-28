import { Card, CardContent } from "@kioskkit/ui";

interface StatusCardProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function StatusCard({ icon, title, description, action, className }: StatusCardProps) {
  return (
    <Card className={`flex flex-1 items-center justify-center ${className ?? ""}`}>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        {icon}
        <div>
          <p className="text-foreground font-medium">{title}</p>
          {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
