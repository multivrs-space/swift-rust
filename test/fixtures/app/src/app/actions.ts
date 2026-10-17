"use server";

const store: string[] = ["initial-item"];

export async function addItem(formData: FormData) {
  const name = String(formData.get("name") || "anonymous");
  store.push(name);
  return { success: true, count: store.length, item: name };
}

export async function rpcMultiply(a: number, b: number) {
  return { result: a * b };
}
