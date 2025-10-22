import { useState } from "react";
import styles from "./save-scenario-modal.module.css";

export interface SaveScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, tags: string[]) => Promise<void>;
  isSaving?: boolean;
}

export function SaveScenarioModal({
  isOpen,
  onClose,
  onSave,
  isSaving = false,
}: SaveScenarioModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    await onSave(name, description, tags);
    // Reset form
    setName("");
    setDescription("");
    setTags([]);
    setTagInput("");
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className="ds-title">Save scenario</h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton}
            aria-label="Close dialog"
            disabled={isSaving}
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="scenario-name" className="ds-body-strong">
              Scenario name <span className={styles.required}>*</span>
            </label>
            <input
              id="scenario-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., High-confidence expansion Q4"
              className={styles.input}
              required
              disabled={isSaving}
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="scenario-description" className="ds-body-strong">
              Description
            </label>
            <textarea
              id="scenario-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What assumptions or context drove this scenario?"
              className={styles.textarea}
              rows={3}
              disabled={isSaving}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="scenario-tags" className="ds-body-strong">
              Tags
            </label>
            <div className={styles.tagInput}>
              <input
                id="scenario-tags"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tag (press Enter)"
                className={styles.input}
                disabled={isSaving}
              />
              <button
                type="button"
                onClick={handleAddTag}
                className={styles.addTagButton}
                disabled={isSaving || !tagInput.trim()}
              >
                Add tag
              </button>
            </div>
            {tags.length > 0 && (
              <div className={styles.tagList} role="list">
                {tags.map((tag) => (
                  <span key={tag} className={styles.tag} role="listitem">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className={styles.removeTagButton}
                      aria-label={`Remove tag ${tag}`}
                      disabled={isSaving}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={onClose}
              className={styles.cancelButton}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.saveButton}
              disabled={isSaving || !name.trim()}
            >
              {isSaving ? "Saving..." : "Save scenario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
