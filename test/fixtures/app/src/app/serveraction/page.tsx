import { Form } from "swift-rust";
import { addItem } from "../actions";

export default function ServerActionPage() {
  return (
    <div>
      <h1 data-testid="title">Server Actions Demo</h1>
      <Form action={addItem}>
        <input type="text" name="name" defaultValue="item-123" />
        <button type="submit">Submit</button>
      </Form>
    </div>
  );
}
