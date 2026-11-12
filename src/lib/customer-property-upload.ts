export const MAX_MEDIA = 12;

export function appendCustomerPropertyMedia(current: string[], url: string): string[] {
  if (!url) return current;
  return Array.from(new Set([...current, url])).slice(0, MAX_MEDIA);
}

export async function uploadCustomerPropertyFiles<TFile>(
  files: TFile[],
  uploadFile: (file: TFile, index: number) => Promise<string>,
  onUploaded: (url: string) => void,
): Promise<string[]> {
  const uploaded: string[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const url = await uploadFile(files[index]!, index);
    if (!url) throw new Error("نشانی فایل آپلودشده دریافت نشد.");

    uploaded.push(url);
    onUploaded(url);
  }

  return uploaded;
}
