import {Select} from '@inkjs/ui';
import {useMemo} from 'react';

import type {Project} from '../../models.js';
import {Form} from './layout.js';

export const ProjectPicker = ({
  projects,
  defaultProjectId,
  onSelect,
  onCancel,
}: {
  projects: Project[];
  defaultProjectId: number | null;
  onSelect: (projectId: number | null) => void;
  onCancel: () => void;
}) => {
  const ordered = useMemo(() => {
    const preferred = projects.find(
      (project) => project.id === defaultProjectId,
    );
    return preferred
      ? [
          preferred,
          ...projects.filter((project) => project.id !== preferred.id),
        ]
      : projects;
  }, [defaultProjectId, projects]);
  const options = [
    ...(defaultProjectId === null
      ? [{label: 'No project', value: 'none'}]
      : []),
    ...ordered.map((project) => ({
      label: project.name,
      value: String(project.id),
    })),
    ...(defaultProjectId === null
      ? []
      : [{label: 'No project', value: 'none'}]),
  ];

  return (
    <Form title="Choose project" onCancel={onCancel}>
      <Select
        visibleOptionCount={Math.min(12, options.length)}
        options={options}
        onChange={(value) => onSelect(value === 'none' ? null : Number(value))}
      />
    </Form>
  );
};
