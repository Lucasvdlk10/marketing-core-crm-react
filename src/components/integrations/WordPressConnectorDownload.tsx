import { ArrowDownToLine } from 'lucide-react';

const DOWNLOAD_PATH = './downloads/marketing-core-wordpress-connector.zip';

export function WordPressConnectorDownload() {
  return (
    <a
      className="btn primary"
      href={DOWNLOAD_PATH}
      download="marketing-core-wordpress-connector.zip"
      aria-label="Baixar plugin Marketing Core CRM para WordPress"
    >
      <ArrowDownToLine size={17} aria-hidden="true" />
      Baixar plugin WordPress
    </a>
  );
}
