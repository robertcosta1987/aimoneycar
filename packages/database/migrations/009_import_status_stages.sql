-- Allow granular import status values for progress tracking
ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_status_check;
ALTER TABLE imports ADD CONSTRAINT imports_status_check
  CHECK (status IN (
    'pending',
    'processing',
    'downloading',
    'parsing',
    'importing_referencias',
    'importing_entidades',
    'importing_detalhes',
    'complete',
    'error'
  ));
