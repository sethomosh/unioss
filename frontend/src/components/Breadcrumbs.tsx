import { Link, useLocation } from 'react-router-dom';

interface BreadcrumbItem {
  path: string;
  label: string;
}

export function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter(x => x);
  
  // Generate breadcrumb items
  const breadcrumbs: BreadcrumbItem[] = [];
  let currentPath = '';
  
  // Add home breadcrumb
  breadcrumbs.push({ path: '/', label: 'Dashboard' });
  
  // Add breadcrumbs for each path segment
  pathnames.forEach((segment) => {
    currentPath += `/${segment}`;
    
    // Format label (convert kebab-case to Title Case)
    const label = segment
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    breadcrumbs.push({
      path: currentPath,
      label: label || segment
    });
  });
  
  // Don't show breadcrumbs if we're on the dashboard
  if (location.pathname === '/') {
    return null;
  }
  
  return (
    <nav className="flex mb-4" aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2 text-sm">
        {breadcrumbs.map((breadcrumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          
          return (
            <li key={breadcrumb.path} className="flex items-center">
              {isLast ? (
                <span className="font-medium text-foreground truncate max-w-xs">
                  {breadcrumb.label}
                </span>
              ) : (
                <>
                  <Link 
                    to={breadcrumb.path} 
                    className="text-muted-foreground hover:text-foreground truncate max-w-xs"
                  >
                    {breadcrumb.label}
                  </Link>
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    className="mx-2 text-muted-foreground flex-shrink-0"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}