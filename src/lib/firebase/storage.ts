/**
 * LOCAL FACE STORAGE SERVICE
 * Proxies for cloud storage to avoid costs during deployment/testing.
 * Saves images as Base64 in Browser LocalStorage.
 */

const LOCAL_FACE_PREFIX = "govind_face_";

/**
 * Saves face image to local storage as data URL
 */
export const uploadFaceImage = async (
  uid: string,
  file: File
): Promise<string> => {
  if (!file) {
    throw new Error("FACE_IMAGE_MISSING");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      try {
        localStorage.setItem(`${LOCAL_FACE_PREFIX}${uid}`, base64String);
        console.log("[STORAGE] Face image saved locally for UID:", uid);
        resolve(base64String);
      } catch (e) {
        console.error("[STORAGE] LocalStorage quota exceeded", e);
        reject(new Error("LOCAL_STORAGE_FULL"));
      }
    };
    reader.onerror = () => reject(new Error("READ_FILE_FAILED"));
    reader.readAsDataURL(file);
  });
};

/**
 * Retrieves face image from local storage
 */
export const getFaceImageUrl = async (uid: string): Promise<string> => {
  const data = localStorage.getItem(`${LOCAL_FACE_PREFIX}${uid}`);
  if (!data) {
    throw new Error("FACE_NOT_FOUND");
  }
  return data;
};
