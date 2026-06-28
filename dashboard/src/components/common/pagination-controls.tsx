import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export const PaginationControls = ({
  page,
  totalPages,
  onPageChange,
  className,
}: PaginationControlsProps) => {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className={className ?? 'flex items-center justify-between gap-2'}>
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="group"
      >
        <ChevronLeftIcon
          data-icon="inline-start"
          className="transition-transform duration-150 group-hover:-translate-x-0.5"
        />
        Anterior
      </Button>

      <p className='accent-gradient rounded-full px-3 py-0.5 text-sm font-medium text-primary-foreground tabular-nums glow-sm'>
        {page} / {totalPages}
      </p>

      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="group"
      >
        Siguiente
        <ChevronRightIcon
          data-icon="inline-end"
          className="transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </Button>
    </div>
  );
};
