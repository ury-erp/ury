import { ExpandableSearch } from '@ury/ui';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onVisibilityChange: (isVisible: boolean) => void;
  isVisible: boolean;
  disabled?: boolean;
}

export default function SearchBar({
  value,
  onChange,
  onVisibilityChange,
  isVisible,
  disabled,
}: SearchBarProps) {
  return (
    <ExpandableSearch
      value={value}
      onChange={onChange}
      isExpanded={isVisible}
      onExpandedChange={onVisibilityChange}
      placeholder="Search menu items..."
      disabled={disabled}
    />
  );
}
