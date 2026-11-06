param([Parameter(Mandatory=$true)][string]$Directory)
# Read-only asset QA: report actual transparent photo openings, not white pixels.
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing.Common,System.Drawing.Primitives,System.Runtime.InteropServices,System.Private.Windows.Core,System.Private.Windows.GdiPlus,System.Collections -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class FrameAlphaInspector {
  public static object Inspect(string file) {
    using (var image = new Bitmap(file)) {
      int w=image.Width, h=image.Height;
      var data=image.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
      var bytes=new byte[Math.Abs(data.Stride)*h];
      Marshal.Copy(data.Scan0,bytes,0,bytes.Length);
      image.UnlockBits(data);
      int stride=Math.Abs(data.Stride), transparent=0;
      var seen=new bool[w*h]; var queue=new int[w*h];
      var areas=new List<object>();
      for(int start=0;start<w*h;start++) {
        if(seen[start] || bytes[(start/w)*stride+(start%w)*4+3]>=24) continue;
        int head=0,tail=1,minX=w,minY=h,maxX=0,maxY=0;
        bool edge=false; queue[0]=start;seen[start]=true;
        while(head<tail) {
          int i=queue[head++], x=i%w,y=i/w;
          minX=Math.Min(x,minX);maxX=Math.Max(x,maxX);minY=Math.Min(y,minY);maxY=Math.Max(y,maxY);
          if(x==0||y==0||x==w-1||y==h-1)edge=true;
          int[] near={x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1};
          foreach(int next in near) if(next>=0&&!seen[next]&&bytes[(next/w)*stride+(next%w)*4+3]<24) {
            seen[next]=true;queue[tail++]=next;
          }
        }
        transparent+=tail;
        if(!edge&&maxX-minX>w*.1&&maxY-minY>h*.04&&tail>w*h*.015)
          areas.Add(new {x=minX,y=minY,width=maxX-minX+1,height=maxY-minY+1,pixels=tail,fill=(double)tail/((maxX-minX+1)*(maxY-minY+1))});
      }
      return new {file=System.IO.Path.GetFileName(file),width=w,height=h,transparent,areas};
    }
  }
}
'@
Get-ChildItem -LiteralPath $Directory -Filter '*.png' | ForEach-Object {
  [FrameAlphaInspector]::Inspect($_.FullName)
} | ConvertTo-Json -Depth 5
