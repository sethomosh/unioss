import { useState, useMemo } from 'react';

interface Column<T> {
  key: string;
  title: string;
  render?: (value: any, row: T) => React.ReactNode;
  sortable?: boolean;
  filterable?: boolean;
}

interface EnhancedTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchable?: boolean;
  pagination?: boolean;
  itemsPerPage?: number;
  onRowClick?: (row: T) => void;
}

export function EnhancedTable<T>({
  data,
  columns,
  searchable = false,
  pagination = false,
  itemsPerPage = 10,
  onRowClick
}: EnhancedTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Filter data based on search query and filters
  const filteredData = useMemo(() => {
    return data.filter(item => {
      // Apply search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = columns.some(column => {
          const value = (item as any)[column.key];
          return value && value.toString().toLowerCase().includes(query);
        });
        if (!matchesSearch) return false;
      }
      
      // Apply column filters
      for (const [key, filterValue] of Object.entries(filters)) {
        if (filterValue) {
          const value = (item as any)[key];
          if (!value || !value.toString().toLowerCase().includes(filterValue.toLowerCase())) {
            return false;
          }
        }
      }
      
      return true;
    });
  }, [data, searchQuery, filters, columns]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aValue = (a as any)[sortConfig.key];
      const bValue = (b as any)[sortConfig.key];
      
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Paginate data
  const paginatedData = useMemo(() => {
    if (!pagination) return sortedData;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage, pagination]);

  const handleSort = (key: string) => {
    setSortConfig(prevConfig => {
      if (!prevConfig || prevConfig.key !== key) {
        return { key, direction: 'asc' };
      }
      if (prevConfig.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null;
    });
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setCurrentPage(1); // Reset to first page when filtering
  };

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      {(searchable || columns.some(col => col.filterable)) && (
        <div className="flex flex-col md:flex-row gap-4">
          {searchable && (
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1); // Reset to first page when searching
                }}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <svg 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
          )}
          
          {columns.filter(col => col.filterable).map(column => (
            <div key={column.key} className="flex-1">
              <input
                type="text"
                placeholder={`Filter by ${column.title}`}
                value={filters[column.key] || ''}
                onChange={(e) => handleFilterChange(column.key, e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ))}
        </div>
      )}
      
      {/* Table */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {columns.map(column => (
                <th 
                  key={column.key}
                  className={`text-left py-3 px-4 font-medium ${
                    column.sortable ? 'cursor-pointer hover:bg-muted/50' : ''
                  }`}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center gap-1">
                    <span>{column.title}</span>
                    {column.sortable && sortConfig?.key === column.key && (
                      <svg 
                        width="14" 
                        height="14" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                        className={sortConfig.direction === 'asc' ? '' : 'rotate-180'}
                      >
                        <path d="M12 5v14M5 12l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((row, index) => (
                <tr 
                  key={index} 
                  className={`border-b border-border/50 hover:bg-muted/30 ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map(column => (
                    <td key={column.key} className="py-3 px-4">
                      {column.render 
                        ? column.render((row as any)[column.key], row) 
                        : (row as any)[column.key]
                      }
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td 
                  colSpan={columns.length} 
                  className="py-8 px-4 text-center text-muted-foreground"
                >
                  No data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, sortedData.length)} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length} entries
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 rounded-md border border-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/50"
            >
              Previous
            </button>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = currentPage <= 3 
                ? i + 1 
                : currentPage >= totalPages - 2 
                  ? totalPages - 4 + i 
                  : currentPage - 2 + i;
                  
              if (page > totalPages) return null;
              
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded-md ${
                    currentPage === page 
                      ? 'bg-primary text-primary-foreground' 
                      : 'border border-border hover:bg-muted/50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 rounded-md border border-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}