import type { Metadata } from "next";
import RentalsWebGate from "../RentalsWebGate";
import RentalPortal from "./RentalPortal";
export const metadata:Metadata={title:"Property portal | EOD-HUB Rentals",robots:{index:false,follow:false}};
export default function RentalPortalPage(){return <RentalsWebGate><RentalPortal/></RentalsWebGate>;}
