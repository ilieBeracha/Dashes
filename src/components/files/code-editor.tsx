"use client";

import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

interface CodeEditorProps {
  value: string;
  language: string;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
}

export function CodeEditor({ value, language, onChange, onSave }: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor;

      // Cmd+S to save
      editor.addAction({
        id: "save-file",
        label: "Save File",
        keybindings: [2048 | 49], // Cmd+S
        run: () => {
          const currentValue = editor.getValue();
          onSave(currentValue);
        },
      });
    },
    [onSave]
  );

  // Update editor value when external changes arrive
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      theme="vs-dark"
      options={{
        fontSize: 13,
        fontFamily: "JetBrains Mono, Menlo, Monaco, monospace",
        minimap: { enabled: false },
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        wordWrap: "on",
        tabSize: 2,
        automaticLayout: true,
        padding: { top: 12 },
      }}
    />
  );
}
