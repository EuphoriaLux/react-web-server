#!/usr/bin/env python3
"""Root-owned forced SSH command. Run as the unprivileged deploy user."""
import fcntl, os, pathlib, re, shutil, sys, tarfile, tempfile, time
ROOT = pathlib.Path('/var/www/html')
STATE = pathlib.Path('/var/lib/cloudmargin-deploy')

def command(value):
    match = re.fullmatch(r'(deploy|remove) (production|pr-[1-9][0-9]*)', value)
    if not match or (match[1] == 'remove' and match[2] == 'production'):
        raise ValueError('Only deploy production, deploy pr-N, or remove pr-N are allowed')
    return match[1], match[2]

def extract(archive, target):
    total=0; seen=set()
    with tarfile.open(archive, 'r:gz') as tar:
        members=tar.getmembers()
        if len(members)>10000: raise ValueError('Too many archive entries')
        for m in members:
            path=pathlib.PurePosixPath(m.name)
            if path.is_absolute() or '..' in path.parts or m.name in seen:
                raise ValueError('Unsafe or duplicate archive path')
            seen.add(m.name)
            if not (m.name=='index.html' or path.parts and path.parts[0]=='assets'):
                raise ValueError('Only index.html and assets are accepted')
            if not (m.isfile() or m.isdir()): raise ValueError('Links and special files are forbidden')
            if m.name=='index.html' and not m.isfile(): raise ValueError('Entry point must be a regular file')
            total+=m.size
            if total>50*1024*1024: raise ValueError('Uncompressed site exceeds 50 MiB')
        for m in members:
            dest=target/m.name
            if m.isdir(): dest.mkdir(parents=True,exist_ok=True); dest.chmod(0o755)
            else:
                dest.parent.mkdir(parents=True,exist_ok=True)
                with tar.extractfile(m) as source, dest.open('wb') as out: shutil.copyfileobj(source,out)
                dest.chmod(0o644)
    if not (target/'index.html').is_file() or not (target/'assets').is_dir():
        raise ValueError('Missing site entry point/assets')

def main():
    action, name = command(os.environ.get('SSH_ORIGINAL_COMMAND',''))
    STATE.mkdir(exist_ok=True)
    with (STATE/'deploy.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        destination = ROOT if name=='production' else ROOT/'previews'/name
        if action=='remove':
            if destination.is_symlink(): raise ValueError('Refusing a symlink destination')
            if destination.exists(): shutil.rmtree(destination)
            print('Preview removed'); return
        with tempfile.TemporaryDirectory(dir=STATE) as temporary:
            temporary=pathlib.Path(temporary); archive=temporary/'site.tgz'
            with archive.open('wb') as out:
                size=0
                while chunk:=sys.stdin.buffer.read(1024*1024):
                    size+=len(chunk)
                    if size>20*1024*1024: raise ValueError('Compressed site exceeds 20 MiB')
                    out.write(chunk)
            stage=temporary/'stage';stage.mkdir()
            extract(archive,stage)
            # The dedicated user owns this tree; never follow existing links.
            for p in ROOT.rglob('*'):
                if p.is_symlink(): raise ValueError('Unexpected link in managed web root')
            destination.mkdir(parents=True,exist_ok=True)
            if name=='production' and (destination/'index.html').exists():
                backups=STATE/'backups';backups.mkdir(exist_ok=True)
                backup=backups/f'index-{time.time_ns()}.html'
                shutil.copy2(destination/'index.html',backup)
                for old in sorted(backups.glob('index-*.html'))[:-10]: old.unlink()
            shutil.copytree(stage/'assets',destination/'assets',dirs_exist_ok=True)
            for p in (destination/'assets').rglob('*'): p.chmod(0o755 if p.is_dir() else 0o644)
            tmp_index=destination/'.index-new';shutil.copyfile(stage/'index.html',tmp_index);tmp_index.chmod(0o644)
            os.replace(tmp_index,destination/'index.html')
            print(f'Deployed {name}')
if __name__=='__main__':
    try: main()
    except Exception as exc: print(f'Deployment rejected: {exc}',file=sys.stderr);sys.exit(1)
