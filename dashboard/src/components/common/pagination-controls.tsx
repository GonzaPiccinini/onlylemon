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
      >
        Anterior
      </Button>
      <p className='text-sm text-muted-foreground'>
        Pagina {page} de {totalPages}
      </p>
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Siguiente
      </Button>
    </div>
  );
};
