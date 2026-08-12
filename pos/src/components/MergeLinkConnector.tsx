import { Link2 } from 'lucide-react';
import { t } from '../i18n';

interface MergeLinkConnectorProps {
  leftTable: string;
  rightTable: string;
}

const MergeLinkConnector = ({ leftTable, rightTable }: MergeLinkConnectorProps) => (
  <div
    className="flex w-8 shrink-0 items-center justify-center self-center px-1 sm:w-10"
    role="img"
    aria-label={t('tables.merged_with_list', { tables: rightTable })}
    title={t('tables.merged_with_list', { tables: `${leftTable}, ${rightTable}` })}
  >
    <Link2 className="h-5 w-5 shrink-0 text-blue-600" />
  </div>
);

export default MergeLinkConnector;
