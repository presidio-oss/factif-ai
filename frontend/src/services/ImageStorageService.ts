/**
 * Image Storage Service
 * 
 * This service manages images efficiently for the explore mode graph visualization.
 * It stores images as references rather than embedding them directly in nodes,
 * generates thumbnails for graph view, and provides automatic cleanup.
 */

export class ImageStorageService {
  private static instance: ImageStorageService;
  private images: Map<string, string> = new Map();
  private thumbnails: Map<string, string> = new Map();
  private readonly maxImages: number = 100;
  private readonly thumbnailSize: number = 200; // px

  private constructor() {
    console.log("ImageStorageService initialized");
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): ImageStorageService {
    if (!ImageStorageService.instance) {
      ImageStorageService.instance = new ImageStorageService();
    }
    return ImageStorageService.instance;
  }

  /**
   * Store an image and return a reference ID
   */
  public storeImage(imageData: string): string {
    // Clean up if we're storing too many images
    if (this.images.size >= this.maxImages) {
      this.cleanup();
    }

    // Generate a unique ID for this image
    const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Ensure the imageData has appropriate data URI prefix
    const processedImageData = imageData.startsWith("data:") 
      ? imageData 
      : `data:image/png;base64,${imageData}`;
      
    this.images.set(imageId, processedImageData);

    // Generate and store thumbnail asynchronously
    this.generateThumbnail(imageId, processedImageData);

    return imageId;
  }

  /**
   * Get full image by reference ID
   */
  public getImage(imageId: string): string | undefined {
    return this.images.get(imageId);
  }

  /**
   * Get thumbnail by reference ID (falls back to full image if thumbnail not ready)
   */
  public getThumbnail(imageId: string): string | undefined {
    return this.thumbnails.get(imageId) || this.images.get(imageId);
  }

  /**
   * Get image count
   */
  public getImageCount(): number {
    return this.images.size;
  }

  /**
   * Remove oldest images when we reach capacity
   */
  private cleanup(): void {
    console.log(`Cleaning up images. Current count: ${this.images.size}`);
    
    // Delete the oldest 20% of images
    const keysToDelete = Array.from(this.images.keys())
      .slice(0, Math.floor(this.maxImages * 0.2));
      
    keysToDelete.forEach(key => {
      this.images.delete(key);
      this.thumbnails.delete(key);
    });
    
    console.log(`Deleted ${keysToDelete.length} images. New count: ${this.images.size}`);
  }

  /**
   * Generate a smaller thumbnail for graph view
   */
  private async generateThumbnail(imageId: string, imageData: string): Promise<void> {
    try {
      // Create an image object
      const img = new Image();
      img.src = imageData;
      
      // Wait for the image to load
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // Create a canvas for the thumbnail
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Calculate dimensions maintaining aspect ratio
      const scale = this.thumbnailSize / Math.max(img.width, img.height);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      canvas.width = width;
      canvas.height = height;

      // Draw the image at the new size
      ctx.drawImage(img, 0, 0, width, height);
      
      // Get the thumbnail data URL (use JPEG for smaller size)
      const thumbnailData = canvas.toDataURL('image/jpeg', 0.7);
      
      this.thumbnails.set(imageId, thumbnailData);
    } catch (error) {
      console.error('Thumbnail generation failed:', error);
    }
  }
}

export default ImageStorageService;
