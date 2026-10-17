import { DocArticle } from "@/app/components/doc-article";

export const metadata = { title: "Server Actions" };

export default function ServerActionsGuidePage() {
  return (
    <DocArticle>
      <h1>Server Actions</h1>
      <p>
        Server Actions allow client components and forms to invoke asynchronous server-side Rust/Bun
        functions without manually defining API endpoints.
      </p>

      <h2>The &quot;use server&quot; Directive</h2>
      <p>
        Define server actions by annotating an async function or an entire module with{" "}
        <code>&quot;use server&quot;</code>:
      </p>

      <div className="code-block">
        <div className="code-block-header">
          <span>app/actions.ts</span>
        </div>
        <pre>
          <code>{`"use server";

export async function addComment(formData: FormData) {
  const content = formData.get("content");
  // Mutations execute securely on the server
  await db.comments.create({ content });
  return { success: true };
}`}</code>
        </pre>
      </div>

      <h2>Forms with Progressive Enhancement</h2>
      <p>
        Use the <code>&lt;Form&gt;</code> component from <code>swift-rust</code> to bind server
        actions directly:
      </p>

      <div className="code-block">
        <div className="code-block-header">
          <span>app/comments/page.tsx</span>
        </div>
        <pre>
          <code>{`import { Form } from "swift-rust";
import { addComment } from "../actions";

export default function CommentsPage() {
  return (
    <Form action={addComment} className="flex flex-col gap-4">
      <textarea name="content" required placeholder="Write a comment..." />
      <button type="submit">Post Comment</button>
    </Form>
  );
}`}</code>
        </pre>
      </div>

      <h2>Direct Invocation from Client Components</h2>
      <p>Server actions can be called directly like standard async JavaScript functions:</p>

      <div className="code-block">
        <div className="code-block-header">
          <span>app/like-button.tsx</span>
        </div>
        <pre>
          <code>{`"use client";
import { useState, useTransition } from "react";
import { likePost } from "./actions";

export function LikeButton({ postId }: { postId: string }) {
  const [likes, setLikes] = useState(0);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const res = await likePost(postId);
          setLikes(res.newCount);
        });
      }}
    >
      {likes} Likes
    </button>
  );
}`}</code>
        </pre>
      </div>
    </DocArticle>
  );
}
