/**
 * Every row of a query, fetched in pages. Supabase returns at most 1,000
 * rows per request, and attendance passes that within a couple of years.
 */
export async function fetchAll<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const size = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as T[]));
    if (!data || data.length < size) return all;
  }
}
