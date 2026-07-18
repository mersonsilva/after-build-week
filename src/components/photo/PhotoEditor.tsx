import React, { useState } from "react";
import Cropper from "react-easy-crop";

type PhotoContext = "profile" | "gallery" | "chat";

type PhotoEditorProps = {
  imageUrl: string;
  context?: PhotoContext;
  onCancel: () => void;
  onSave: (crop: unknown) => void;
};

export function PhotoEditor({ imageUrl, context = "profile", onCancel, onSave }: PhotoEditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<unknown>(null);
  const aspect = context === "chat" ? 4 / 5 : context === "gallery" ? 1 : 3 / 4;

  return (
    <section className="photo-editor-react" aria-label="Editar foto">
      <div className="photo-editor-react-stage">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspect}
          objectFit="contain"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
        />
      </div>
      <footer className="photo-editor-react-actions">
        <button type="button" onClick={onCancel}>Cancelar</button>
        <button type="button" onClick={() => setRotation((value) => value + 90)}>Girar</button>
        <button type="button" onClick={() => onSave(croppedAreaPixels)}>Salvar</button>
      </footer>
    </section>
  );
}

export default PhotoEditor;
