import importlib.util,io,os,pathlib,tarfile,tempfile,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('receiver',pathlib.Path(__file__).with_name('receive-deployment.py'));r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
def archive(entries):
 out=io.BytesIO()
 with tarfile.open(fileobj=out,mode='w:gz') as t:
  for name,body,kind in entries:
   i=tarfile.TarInfo(name);i.type=kind
   if kind==tarfile.REGTYPE:i.size=len(body);t.addfile(i,io.BytesIO(body))
   else:i.linkname='/etc/passwd';t.addfile(i)
 return out.getvalue()
class Tests(unittest.TestCase):
 def test_command_restrictions(self):
  for bad in ['remove production','deploy ../../etc','deploy pr-1; id','bash','deploy pr-0']:
   with self.assertRaises(ValueError):r.command(bad)
 def test_archive_validation(self):
  for name,kind in [('../index.html',tarfile.REGTYPE),('/index.html',tarfile.REGTYPE),('assets/link',tarfile.SYMTYPE),('config.php',tarfile.REGTYPE)]:
   with tempfile.TemporaryDirectory() as d:
    p=pathlib.Path(d);f=p/'in.tgz';f.write_bytes(archive([(name,b'evil',kind)]));stage=p/'stage';stage.mkdir()
    with self.assertRaises(ValueError):r.extract(f,stage)
 def test_preview_does_not_replace_production_and_can_be_removed(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);r.ROOT=p/'web';r.ROOT.mkdir();r.STATE=p/'state';(r.ROOT/'index.html').write_text('production')
   data=archive([('index.html',b'preview',tarfile.REGTYPE),('assets/a.js',b'example',tarfile.REGTYPE)])
   class Input:
    buffer=io.BytesIO(data)
   with patch.dict(os.environ,SSH_ORIGINAL_COMMAND='deploy pr-12'),patch('sys.stdin',Input()):r.main()
   self.assertEqual((r.ROOT/'index.html').read_text(),'production');self.assertEqual((r.ROOT/'previews/pr-12/index.html').read_text(),'preview')
   with patch.dict(os.environ,SSH_ORIGINAL_COMMAND='remove pr-12'):r.main()
   self.assertFalse((r.ROOT/'previews/pr-12').exists())
 def test_production_deploy_keeps_previous_entrypoint(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);r.ROOT=p/'web';r.ROOT.mkdir();r.STATE=p/'state';(r.ROOT/'index.html').write_text('previous')
   class Input:buffer=io.BytesIO(archive([('index.html',b'new',tarfile.REGTYPE),('assets/a.js',b'example',tarfile.REGTYPE)]))
   with patch.dict(os.environ,SSH_ORIGINAL_COMMAND='deploy production'),patch('sys.stdin',Input()):r.main()
   self.assertEqual((r.ROOT/'index.html').read_text(),'new');self.assertEqual(next((r.STATE/'backups').glob('*')).read_text(),'previous')
if __name__=='__main__':unittest.main()
