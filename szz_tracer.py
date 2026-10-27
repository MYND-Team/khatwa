import subprocess
from pydriller import Repository

repo_path = "."
fix_hash = "ضع_هنا_الـHash_الخاص_بآخر_تعديل"

candidate_bics = set()

for commit in Repository(repo_path, single=fix_hash).traverse_commits():
    parent_hash = f"{commit.hash}~1"
    
    for modified_file in commit.modified_files:
        deleted_lines = modified_file.diff_parsed["deleted"]
        old_path = modified_file.old_path or modified_file.new_path

        for line_number, line_content in deleted_lines:
            try:
                result = subprocess.run(
                    ["git", "blame", parent_hash, "-L", f"{line_number},{line_number}", "--", old_path],
                    cwd=repo_path,
                    capture_output=True,
                    text=True,
                    check=True
                )
                blame_output = result.stdout.strip()
                if blame_output:
                    bic_hash = blame_output.split()[0].replace("^", "")
                    candidate_bics.add(bic_hash)
            except subprocess.CalledProcessError:
                pass

print("Candidate Bug-Inducing Commits (BICs):")
for bic in candidate_bics:
    print(f"- {bic}")