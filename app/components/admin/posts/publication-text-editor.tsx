"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState } from "react";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/copy/provider";
import { useToast } from "@/components/ui/toast-provider";
import { RichTextLinkDialog } from "@/components/admin/ui/rich-text-link-dialog";

export function PublicationTextEditor({ value, onChange, label, id, error }: { error?: string; value: string; onChange: (html: string) => void; label: string; id: string }) {
  const { t } = useCopy();
  const { addToast } = useToast();
  const [linkOpen, setLinkOpen] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, protocols: ["http", "https"] } })],
    content: value,
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
    editorProps: { attributes: { class: "prose-gsp min-h-48 px-4 py-3 text-base leading-7 text-text focus:outline-none", "aria-label": label, "aria-invalid": String(Boolean(error)), "aria-describedby": error ? `${id}-error` : "" } },
  });
  useEditorState({ editor, selector: ({ editor: current }) => ({ document: current?.state.doc, selection: current?.state.selection, marks: current?.state.storedMarks }) });
  useEffect(() => { if (editor && editor.getHTML() !== value) editor.commands.setContent(value, { emitUpdate: false }); }, [editor, value]);
  function insertLink() {
    if (!editor || (editor.state.selection.empty && !editor.isActive("link"))) { addToast(t.posts.linkSelectionTitle, t.posts.linkSelectionDescription, "error"); return; }
    setLinkOpen(true);
  }
  return <div className="overflow-hidden rounded-[8px] border border-border bg-background">
    <RichTextLinkDialog description={t.posts.linkHelp} open={linkOpen} onClose={() => setLinkOpen(false)} onSave={url => { editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run(); }} />
            <div role="toolbar" aria-label={label} className="flex flex-wrap gap-1 border-b border-border bg-surface-alt p-2">
              <Button type="button" aria-pressed={editor?.isActive("bold") ?? false} aria-label={t.admin.toolbarBold} title={t.admin.toolbarBold} onClick={() => editor?.chain().focus().toggleBold().run()} className="flex h-10 w-10 items-center justify-center rounded-[8px] aria-pressed:bg-primary/10 aria-pressed:text-primary hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Bold size={16} aria-hidden="true" /></Button>
              <Button type="button" aria-pressed={editor?.isActive("italic") ?? false} aria-label={t.admin.toolbarItalic} title={t.admin.toolbarItalic} onClick={() => editor?.chain().focus().toggleItalic().run()} className="flex h-10 w-10 items-center justify-center rounded-[8px] aria-pressed:bg-primary/10 aria-pressed:text-primary hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Italic size={16} aria-hidden="true" /></Button>
              <Button type="button" aria-pressed={editor?.isActive("heading", { level: 2 }) ?? false} aria-label={t.admin.toolbarHeading2} title={t.admin.toolbarHeading2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className="flex h-10 w-10 items-center justify-center rounded-[8px] aria-pressed:bg-primary/10 aria-pressed:text-primary hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Heading2 size={16} aria-hidden="true" /></Button>
              <Button type="button" aria-pressed={editor?.isActive("heading", { level: 3 }) ?? false} aria-label={t.admin.toolbarHeading3} title={t.admin.toolbarHeading3} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className="flex h-10 w-10 items-center justify-center rounded-[8px] aria-pressed:bg-primary/10 aria-pressed:text-primary hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Heading3 size={16} aria-hidden="true" /></Button>
              <Button type="button" aria-pressed={editor?.isActive("bulletList") ?? false} aria-label={t.admin.toolbarBullets} title={t.admin.toolbarBullets} onClick={() => editor?.chain().focus().toggleBulletList().run()} className="flex h-10 w-10 items-center justify-center rounded-[8px] aria-pressed:bg-primary/10 aria-pressed:text-primary hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><List size={16} aria-hidden="true" /></Button>
              <Button type="button" aria-pressed={editor?.isActive("orderedList") ?? false} aria-label={t.admin.toolbarNumbered} title={t.admin.toolbarNumbered} onClick={() => editor?.chain().focus().toggleOrderedList().run()} className="flex h-10 w-10 items-center justify-center rounded-[8px] aria-pressed:bg-primary/10 aria-pressed:text-primary hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ListOrdered size={16} aria-hidden="true" /></Button>
              <Button type="button" aria-pressed={editor?.isActive("blockquote") ?? false} aria-label={t.admin.toolbarQuote} title={t.admin.toolbarQuote} onClick={() => editor?.chain().focus().toggleBlockquote().run()} className="flex h-10 w-10 items-center justify-center rounded-[8px] aria-pressed:bg-primary/10 aria-pressed:text-primary hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Quote size={16} aria-hidden="true" /></Button>
              <Button type="button" aria-pressed={editor?.isActive("link") ?? false} aria-label={t.admin.toolbarLink} title={t.admin.toolbarLink} onClick={insertLink} className="flex h-10 w-10 items-center justify-center rounded-[8px] aria-pressed:bg-primary/10 aria-pressed:text-primary hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Link2 size={16} aria-hidden="true" /></Button>
            </div>
    <EditorContent id={id} editor={editor} />
    {error && <p id={`${id}-error`} role="alert" className="px-4 pb-3 text-base text-red-600">{error}</p>}
  </div>;
}
