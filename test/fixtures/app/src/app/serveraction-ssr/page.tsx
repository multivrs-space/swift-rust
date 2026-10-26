"use bun";
import { Form } from "swift-rust";
import { addItem } from "../actions";

export default function ServerActionSsrPage() {
  return (
    <Form action={addItem}>
      <input type="text" name="name" defaultValue="ssr-item" />
      <button type="submit">Submit</button>
    </Form>
  );
}
