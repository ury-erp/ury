import { Circle, RectangleHorizontal, Square } from 'lucide-react';
import type { Table } from '../lib/table-api';

interface TableShapeIconProps {
  shape?: Table['table_shape'];
  className?: string;
}

export const TableShapeIcon = ({ shape = 'Rectangle', className }: TableShapeIconProps) => {
  switch (shape) {
    case 'Circle':
      return <Circle className={className} />;
    case 'Square':
      return <Square className={className} />;
    case 'Rectangle':
    default:
      return <RectangleHorizontal className={className} />;
  }
};

