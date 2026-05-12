import zipfile
import os
import shutil
import logging
from typing import List, Optional
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class ZipManager:
    """
    A comprehensive utility for managing ZIP archives, providing methods
    for creation, extraction, and content inspection.
    """
    def __init__(self, archive_path: str):
        self.archive_path = Path(archive_path)

    def create_archive(self, source_dir: str, compression=zipfile.ZIP_DEFLATED):
        """
        Creates a ZIP archive from a source directory.
        """
        source_path = Path(source_dir)
        if not source_path.is_dir():
            raise ValueError(f"Source {source_dir} must be a directory")

        logger.info(f"Creating archive {self.archive_path} from {source_dir}...")
        with zipfile.ZipFile(self.archive_path, 'w', compression) as zipf:
            for root, dirs, files in os.walk(source_dir):
                for file in files:
                    file_path = Path(root) / file
                    arcname = file_path.relative_to(source_path)
                    zipf.write(file_path, arcname)
        logger.info("Archive created successfully.")

    def extract_all(self, destination_dir: str, safe_extract: bool = True):
        """
        Extracts all files from the archive to the destination directory.
        Implements a basic check against ZipSlip (directory traversal attacks).
        """
        dest_path = Path(destination_dir)
        dest_path.mkdir(parents=True, exist_ok=True)

        logger.info(f"Extracting {self.archive_path} to {destination_dir}...")
        with zipfile.ZipFile(self.archive_path, 'r') as zipf:
            for member in zipf.infolist():
                if safe_extract:
                    # Basic ZipSlip prevention
                    target_path = (dest_path / member.filename).resolve()
                    if not str(target_path).startswith(str(dest_path.resolve())):
                        logger.warning(f"Skipping dangerous file: {member.filename}")
                        continue
                zipf.extract(member, dest_path)
        logger.info("Extraction complete.")

    def list_contents(self) -> List[str]:
        """
        Lists all filenames within the archive.
        """
        with zipfile.ZipFile(self.archive_path, 'r') as zipf:
            return zipf.namelist()

    def extract_specific(self, filename: str, destination_dir: str):
        """
        Extracts a single specified file from the archive.
        """
        dest_path = Path(destination_dir)
        dest_path.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(self.archive_path, 'r') as zipf:
            if filename in zipf.namelist():
                zipf.extract(filename, dest_path)
                logger.info(f"Extracted {filename} to {destination_dir}")
            else:
                raise FileNotFoundError(f"File {filename} not found in archive")

    def get_file_size(self, filename: str) -> int:
        """
        Returns the uncompressed size of a specific file.
        """
        with zipfile.ZipFile(self.archive_path, 'r') as zipf:
            info = zipf.getinfo(filename)
            return info.file_size

    def verify_integrity(self) -> bool:
        """
        Checks the archive for CRC errors using zipfile.testzip().
        """
        with zipfile.ZipFile(self.archive_path, 'r') as zipf:
            bad_file = zipf.testzip()
            if bad_file:
                logger.error(f"CRC error found in file: {bad_file}")
                return False
            logger.info("Archive integrity verified.")
            return True

    def add_file(self, file_path: str, arcname: Optional[str] = None):
        """
        Adds a single file to an existing archive.
        """
        p = Path(file_path)
        if not p.exists():
            raise FileNotFoundError(f"File {file_path} not found")
        
        name = arcname if arcname else p.name
        with zipfile.ZipFile(self.archive_path, 'a') as zipf:
            zipf.write(p, name)
        logger.info(f"Added {name} to archive.")

    def remove_all_contents(self):
        """
        ZIP files don't support true deletion. 
        This method recreates the archive without the target files.
        """
        # This is a simplified version for demonstration
        logger.warning("Full removal not implemented in this demo version.")

def run_demo():
    """
    Small demonstration of the ZipManager capabilities.
    """
    test_dir = "test_source"
    os.makedirs(test_dir, exist_ok=True)
    with open(os.path.join(test_dir, "sample.txt"), "w") as f:
        f.write("This is a test file for the zip manager.")
    
    manager = ZipManager("demo.zip")
    try:
        manager.create_archive(test_dir)
        print(f"Files in zip: {manager.list_contents()}")
        manager.extract_all("test_output")
        print("Extraction successful.")
    finally:
        shutil.rmtree(test_dir, ignore_errors=True)
        if os.path.exists("demo.zip"):
            os.remove("demo.zip")
        shutil.rmtree("test_output", ignore_errors=True)

if __name__ == "__main__":
    run_demo()
