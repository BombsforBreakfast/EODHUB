"use client";

import Image from "next/image";
import { Home, GripVertical } from "lucide-react";
import { DndContext, MouseSensor, TouchSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderRentalPhotos } from "@/app/lib/rentals/photoOrder";
import s from "./portal.module.css";

type Props = { photos: string[]; urls: Record<string,string>; disabled: boolean; onChange: (photos: string[]) => void };

export default function RentalPhotoGrid({photos,urls,disabled,onChange}:Props) {
  const sensors=useSensors(
    useSensor(MouseSensor,{activationConstraint:{distance:6}}),
    useSensor(TouchSensor,{activationConstraint:{delay:300,tolerance:8}}),
    useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}),
  );
  return <>
    {photos.length>1?<p className={s.small} id="rental-photo-order-help">Drag photos to rearrange. On a phone, press and hold a photo, then drag. The first photo is the cover. Save your draft to keep the new order.</p>:null}
    <DndContext id="rental-photo-order" sensors={sensors} collisionDetection={closestCenter}
      accessibility={{screenReaderInstructions:{draggable:"Press Space to pick up a photo, use arrow keys to move it, then press Space to drop. Press Escape to cancel."},announcements:{
        onDragStart:({active})=>`Picked up photo ${photos.indexOf(String(active.id))+1}.`,
        onDragOver:({over})=>over?`Over position ${photos.indexOf(String(over.id))+1}.`:undefined,
        onDragEnd:({over})=>over?`Photo moved to position ${photos.indexOf(String(over.id))+1}. Save your draft to keep this order.`:"Photo order unchanged.",
        onDragCancel:()=>"Photo order unchanged.",
      }}}
      onDragEnd={({active,over})=>{if(!disabled&&over)onChange(reorderRentalPhotos(photos,String(active.id),String(over.id)));}}>
      <SortableContext items={photos} strategy={rectSortingStrategy}>
        <div className={s.photoGrid}>{photos.map((path,index)=><SortablePhoto key={path} path={path} index={index} url={urls[path]} disabled={disabled} cover={()=>onChange([path,...photos.filter(p=>p!==path)])} remove={()=>onChange(photos.filter(p=>p!==path))}/>)}</div>
      </SortableContext>
    </DndContext>
  </>;
}

function SortablePhoto({path,index,url,disabled,cover,remove}:{path:string;index:number;url?:string;disabled:boolean;cover:()=>void;remove:()=>void}) {
  const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id:path,disabled});
  return <div ref={setNodeRef} className={s.sortablePhoto} data-dragging={isDragging} style={{transform:CSS.Transform.toString(transform),transition,zIndex:isDragging?2:undefined}}>
    <button type="button" ref={setActivatorNodeRef} className={s.photoDragHandle} {...attributes} {...listeners} disabled={disabled} aria-label={`Reorder photo ${index+1}${index===0?", cover":""}`} onContextMenu={event=>event.preventDefault()}>
      {url?<Image src={url} width={360} height={240} unoptimized draggable={false} alt={`Property photo ${index+1}`}/>:<Home size={38}/>}
      <span className={s.photoGrip}><GripVertical size={17}/><span>{index===0?"Cover":`Photo ${index+1}`}</span></span>
    </button>
    <div>{index>0?<button type="button" disabled={disabled} onClick={cover}>Set cover</button>:null}<button type="button" disabled={disabled} onClick={remove}>Remove</button></div>
  </div>;
}
