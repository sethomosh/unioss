

interface KPICardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: string;
  loading?: boolean;
}

export function KPICard({ title, value, change, changeType = 'neutral', icon, loading }: KPICardProps) {
  const getChangeColor = () => {
    switch (changeType) {
      case 'positive': return 'text-green-600';
      case 'negative': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  const getChangeIcon = () => {
    switch (changeType) {
      case 'positive': return '↗';
      case 'negative': return '↘';
      default: return '→';
    }
  };

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-muted rounded w-24"></div>
          <div className="h-4 bg-muted rounded w-8"></div>
        </div>
        <div className="h-8 bg-muted rounded w-16 mt-2"></div>
      </div>
    );
  }

  return (
    <div className="card h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold">{value}</p>
        {change && (
          <p className={`text-sm flex items-center gap-1 mt-1 ${getChangeColor()}`}>
            <span>{getChangeIcon()}</span>
            <span>{change}</span>
          </p>
        )}
      </div>
    </div>
  );
}
