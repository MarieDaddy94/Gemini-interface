
import React from 'react';
import WebBrowser from '../components/WebBrowser';

interface TerminalViewProps {
  onUrlChange: (url: string) => void;
}

const TerminalView: React.FC<TerminalViewProps> = ({ onUrlChange }) => {
  return (
    <div className="flex-1 min-h-0 h-full">
      <WebBrowser onUrlChange={onUrlChange} />
    </div>
  );
};

export default TerminalView;
