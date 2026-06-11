import { Handle, Position } from '@xyflow/react';

// 1 node = 1 SESSION (1 nhánh chat). Tiêu đề = aiTitle/tên custom; meta đã i18n từ App.
export default function SessionNode({ data, selected }) {
  return (
    <div className={'snode' + (selected ? ' sel' : '') + (data.isRoot ? ' root' : '')} style={{ '--sc': data.color }}>
      <Handle type="target" position={Position.Top} />
      <div className="snode-title">{data.isRoot ? '🌳 ' : '⑂ '}{data.title}</div>
      <div className="snode-meta">{data.turnsLabel}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
