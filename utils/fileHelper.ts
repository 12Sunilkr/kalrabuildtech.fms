
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB Limit
const ALLOWED_MIME_TYPES = [
    'image/jpeg', 
    'image/png', 
    'image/webp', 
    'image/gif', 
    'application/pdf'
];

export const convertFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Security Check: Size
    if (file.size > MAX_FILE_SIZE) {
        alert(`File is too large. Max size is 5MB.`);
        reject(new Error("File size exceeds 5MB limit."));
        return;
    }

    // Security Check: Type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        alert("Invalid file type. Only Images and PDF allowed.");
        reject(new Error("Invalid file type."));
        return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};